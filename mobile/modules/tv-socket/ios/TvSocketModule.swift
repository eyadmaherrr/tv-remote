import ExpoModulesCore
import Foundation
import Security

/**
 * One WebSocket (plus one-off HTTPS requests) to a Samsung TV's remote API on port 8002.
 *
 * The TV serves a certificate issued by Samsung's own "SmartViewSDK" authority and valid only
 * for 127.0.0.1, so normal validation always fails for its LAN address. This module accepts
 * that certificate only when BOTH hold: the host is the TV's IP the app connected to, and the
 * chain comes from SmartViewSDK. Every other server gets the system's default handling.
 */
public class TvSocketModule: Module {
  private var session: URLSession?
  private var task: URLSessionWebSocketTask?
  private var delegate: TvTrustDelegate?

  public func definition() -> ModuleDefinition {
    Name("TvSocket")

    Events("onOpen", "onMessage", "onClose", "onError")

    AsyncFunction("connect") { (url: String, host: String) in
      self.closeSocket()
      guard let u = URL(string: url) else {
        self.sendEvent("onError", ["message": "Bad URL"])
        return
      }
      let d = TvTrustDelegate(host: host)
      d.onOpen = { [weak self] in self?.sendEvent("onOpen", [:]) }
      d.onClose = { [weak self] code, reason in
        self?.sendEvent("onClose", ["code": code, "reason": reason])
      }
      let s = URLSession(configuration: .default, delegate: d, delegateQueue: nil)
      let t = s.webSocketTask(with: u)
      self.session = s
      self.task = t
      self.delegate = d
      t.resume()
      self.receive(t)
    }

    Function("send") { (text: String) in
      self.task?.send(.string(text)) { [weak self] error in
        if let error = error {
          self?.sendEvent("onError", ["message": error.localizedDescription])
        }
      }
    }

    Function("close") {
      self.closeSocket()
    }

    AsyncFunction("request") { (method: String, url: String, host: String, promise: Promise) in
      guard let u = URL(string: url) else {
        promise.reject("E_URL", "Bad URL")
        return
      }
      var req = URLRequest(url: u)
      req.httpMethod = method
      req.timeoutInterval = 8
      let s = URLSession(configuration: .ephemeral, delegate: TvTrustDelegate(host: host), delegateQueue: nil)
      s.dataTask(with: req) { data, response, error in
        if let error = error {
          promise.reject("E_REQUEST", error.localizedDescription)
        } else {
          promise.resolve([
            "status": (response as? HTTPURLResponse)?.statusCode ?? 0,
            "body": String(data: data ?? Data(), encoding: .utf8) ?? "",
          ])
        }
        s.finishTasksAndInvalidate()
      }.resume()
    }

    OnDestroy {
      self.closeSocket()
    }
  }

  private func receive(_ t: URLSessionWebSocketTask) {
    t.receive { [weak self] result in
      guard let self = self, self.task === t else { return }
      switch result {
      case .success(let message):
        switch message {
        case .string(let text):
          self.sendEvent("onMessage", ["data": text])
        case .data(let data):
          self.sendEvent("onMessage", ["data": String(data: data, encoding: .utf8) ?? ""])
        @unknown default:
          break
        }
        self.receive(t)
      case .failure(let error):
        self.sendEvent("onError", ["message": error.localizedDescription])
      }
    }
  }

  private func closeSocket() {
    task?.cancel(with: .goingAway, reason: nil)
    task = nil
    session?.invalidateAndCancel()
    session = nil
    delegate = nil
  }
}

final class TvTrustDelegate: NSObject, URLSessionWebSocketDelegate {
  let host: String
  var onOpen: (() -> Void)?
  var onClose: ((Int, String) -> Void)?

  init(host: String) {
    self.host = host
  }

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    handle(challenge, completionHandler)
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    handle(challenge, completionHandler)
  }

  private func handle(
    _ challenge: URLAuthenticationChallenge,
    _ completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
          challenge.protectionSpace.host == host,
          let trust = challenge.protectionSpace.serverTrust,
          TvTrustDelegate.isSamsungTv(trust)
    else {
      completionHandler(.performDefaultHandling, nil)
      return
    }
    completionHandler(.useCredential, URLCredential(trust: trust))
  }

  /** The chain contains a certificate from Samsung's SmartViewSDK authority. */
  static func isSamsungTv(_ trust: SecTrust) -> Bool {
    guard let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate] else { return false }
    return chain.contains { cert in
      ((SecCertificateCopySubjectSummary(cert) as String?) ?? "").contains("SmartViewSDK")
    }
  }

  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
    onOpen?()
  }

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
    reason: Data?
  ) {
    onClose?(closeCode.rawValue, reason.flatMap { String(data: $0, encoding: .utf8) } ?? "")
  }
}
