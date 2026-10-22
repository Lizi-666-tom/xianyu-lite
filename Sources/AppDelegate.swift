import UIKit
import WebKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let win = UIWindow(frame: UIScreen.main.bounds)
        win.rootViewController = WebViewController()
        win.makeKeyAndVisible()
        window = win
        return true
    }
}

/// 自定义 scheme：xyapp://local/xxx  ->  Bundle 里的 web/xxx
///
/// 为什么不用 file://：workbench.js 里的 url-parse 会把 file:///C:/... 的盘符当主机名
///
/// 为什么用 HTTPURLResponse 而不是 URLResponse：
///   URLResponse 的 mimeType 在某些系统版本上不生效，HTML 会被当纯文本渲染（白底 + 一堆源码）。
final class LocalSchemeHandler: NSObject, WKURLSchemeHandler {

    static let scheme = "xyapp"

    private static let mime: [String: String] = [
        "html": "text/html; charset=utf-8",
        "htm":  "text/html; charset=utf-8",
        "js":   "application/javascript; charset=utf-8",
        "mjs":  "application/javascript; charset=utf-8",
        "css":  "text/css; charset=utf-8",
        "json": "application/json; charset=utf-8",
        "png":  "image/png",
        "jpg":  "image/jpeg",
        "jpeg": "image/jpeg",
        "gif":  "image/gif",
        "webp": "image/webp",
        "svg":  "image/svg+xml",
        "ico":  "image/x-icon",
        "woff": "font/woff",
        "woff2":"font/woff2",
        "ttf":  "font/ttf",
        "otf":  "font/otf",
        "md":   "text/plain; charset=utf-8",
        "txt":  "text/plain; charset=utf-8",
        "map":  "application/json; charset=utf-8",
    ]

    private func mimeType(for path: String) -> String {
        let ext = (path as NSString).pathExtension.lowercased()
        return LocalSchemeHandler.mime[ext] ?? "application/octet-stream"
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(NSError(domain: "xyapp", code: 400))
            return
        }

        // xyapp://local/shop.html  ->  shop.html
        var rel = url.path
        if rel.hasPrefix("/") { rel.removeFirst() }
        if rel.isEmpty { rel = "shop.html" }
        // 去掉 query 里的残留（path 本身不带 query，这里保险）
        if let q = rel.firstIndex(of: "?") { rel = String(rel[..<q]) }

        // 防穿越
        if rel.contains("..") {
            urlSchemeTask.didFailWithError(NSError(domain: "xyapp", code: 403))
            return
        }

        let base = Bundle.main.resourceURL!.appendingPathComponent("web")
        var fileURL = base.appendingPathComponent(rel)

        var isDir: ObjCBool = false
        if !FileManager.default.fileExists(atPath: fileURL.path, isDirectory: &isDir) || isDir.boolValue {
            fileURL = base.appendingPathComponent("shop.html")
        }

        guard let data = try? Data(contentsOf: fileURL) else {
            let msg = "404 \(rel)".data(using: .utf8) ?? Data()
            let resp = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "text/plain; charset=utf-8",
                                                      "Content-Length": "\(msg.count)"])!
            urlSchemeTask.didReceive(resp)
            urlSchemeTask.didReceive(msg)
            urlSchemeTask.didFinish()
            return
        }

        let type = mimeType(for: fileURL.lastPathComponent)

        // ★ 关键：用 HTTPURLResponse 并显式写 Content-Type，否则 HTML 可能被当纯文本
        let headers: [String: String] = [
            "Content-Type": type,
            "Content-Length": "\(data.count)",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
        ]
        guard let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                         headerFields: headers) else {
            urlSchemeTask.didFailWithError(NSError(domain: "xyapp", code: 500))
            return
        }

        urlSchemeTask.didReceive(resp)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // no-op
    }
}

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.949, green: 0.965, blue: 0.953, alpha: 1)

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.setURLSchemeHandler(LocalSchemeHandler(), forURLScheme: LocalSchemeHandler.scheme)

        // 页面里的 window.XY_API_ORIGIN / XY_API_PROJECT
        let js = "window.XY_API_ORIGIN='https://pulm-ai.work';window.XY_API_PROJECT='xianyu';"
        config.userContentController.addUserScript(
            WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(webView)

        if let url = URL(string: "xyapp://local/shop.html") {
            webView.load(URLRequest(url: url))
        }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .default }

    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == LocalSchemeHandler.scheme || scheme == "about" {
            decisionHandler(.allow); return
        }
        if scheme == "https", let host = url.host, host.hasSuffix("pulm-ai.work") {
            decisionHandler(.allow); return
        }
        if scheme == "http" || scheme == "https" {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
        decisionHandler(.cancel)
    }
}
