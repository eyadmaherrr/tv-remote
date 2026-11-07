package expo.modules.tvsocket

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.io.IOException
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * One WebSocket (plus one-off HTTPS requests) to a Samsung TV's remote API on port 8002.
 *
 * The TV serves a certificate issued by Samsung's own "SmartViewSDK" authority and valid only
 * for 127.0.0.1, so normal validation always fails for its LAN address. The client built here
 * accepts it only when BOTH hold: the chain comes from SmartViewSDK, and the host is the TV's
 * IP the app connected to. It is used for TV connections only.
 */
class TvSocketModule : Module() {
  private var socket: WebSocket? = null

  override fun definition() = ModuleDefinition {
    Name("TvSocket")

    Events("onOpen", "onMessage", "onClose", "onError")

    AsyncFunction("connect") { url: String, host: String ->
      closeSocket()
      val request = Request.Builder().url(url).build()
      socket = tvClient(host).newWebSocket(request, object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
          if (socket === webSocket) sendEvent("onOpen", mapOf<String, Any?>())
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
          if (socket === webSocket) sendEvent("onMessage", mapOf("data" to text))
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
          webSocket.close(code, reason)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
          if (socket === webSocket) sendEvent("onClose", mapOf("code" to code, "reason" to reason))
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
          if (socket === webSocket) sendEvent("onError", mapOf("message" to (t.message ?: "Connection failed")))
        }
      })
    }

    Function("send") { text: String ->
      socket?.send(text) ?: false
    }

    Function("close") {
      closeSocket()
    }

    AsyncFunction("request") { method: String, url: String, host: String, promise: Promise ->
      val body = if (method == "GET") null else ByteArray(0).toRequestBody(null)
      val request = Request.Builder().url(url).method(method, body).build()
      tvClient(host).newCall(request).enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
          promise.reject("E_REQUEST", e.message ?: "Request failed", e)
        }

        override fun onResponse(call: Call, response: Response) {
          response.use {
            promise.resolve(mapOf("status" to it.code, "body" to (it.body?.string() ?: "")))
          }
        }
      })
    }

    OnDestroy {
      closeSocket()
    }
  }

  private fun closeSocket() {
    socket?.close(1000, null)
    socket = null
  }

  private fun tvClient(host: String): OkHttpClient {
    val trust = object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
        throw CertificateException("Client certificates are not used")
      }

      override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
        val samsung = chain.any {
          it.issuerX500Principal.name.contains("SmartViewSDK") || it.subjectX500Principal.name.contains("SmartViewSDK")
        }
        if (!samsung) throw CertificateException("Not a Samsung TV certificate")
      }

      override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
    }
    val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf<TrustManager>(trust), SecureRandom()) }
    return OkHttpClient.Builder()
      .sslSocketFactory(ssl.socketFactory, trust)
      .hostnameVerifier { h, _ -> h == host }
      .connectTimeout(8, TimeUnit.SECONDS)
      .readTimeout(0, TimeUnit.MILLISECONDS)
      .pingInterval(20, TimeUnit.SECONDS)
      .build()
  }
}
