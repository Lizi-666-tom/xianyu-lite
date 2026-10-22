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
/// 为什么不用 file://：workbench.js 里的 url-parse 会把 file:///C:/... 的盘符当主机名，抛 Parse Error
final class LocalSchemeHandler: NSObject, WKURLSchemeHandler {

    static let scheme = "xyapp"

    private static let mime: [String: String] = [
        "html": "text/html; charset=utf-8",
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
    ]

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(NSError(domain: "xyapp", code: 400)); return
        }

        // xyapp://local/shop.html  ->  shop.html
        var rel = url.path
        if rel.hasPrefix("/") { rel.removeFirst() }
        if rel.isEmpty { rel = "shop.html" }

        // 防穿越
        if rel.contains("..") {
            urlSchemeTask.didFailWithError(NSError(domain: "xyapp", code: 403)); return
        }

        // Bundle 里 web/ 目录（folder reference 保留结构）
        let base = Bundle.main.resourceURL!.appendingPathComponent("web")
        var fileURL = base.appendingPathComponent(rel)

        // 目录或不存在 -> index.html / shop.html
        var isDir: ObjCBool = false
        if !FileManager.default.fileExists(atPath: fileURL.path, isDirectory: &isDir) || isDir.boolValue {
            fileURL = base.appendingPathComponent("shop.html")
        }

        guard let data = try? Data(contentsOf: fileURL) else {
            urlSchemeTask.didFailWithError(NSError(domain: "xyapp", code: 404)); return
        }

        let ext = fileURL.pathExtension.lowercased()
        let mimeType = LocalSchemeHandler.mime[ext] ?? "application/octet-stream"

        let response = URLResponse(url: url,
                                   mimeType: mimeType,
                                   expectedContentLength: data.count,
                                   textEncodingName: mimeType.contains("charset=utf-8") ? "utf-8" : nil)
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // 无需清理
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

        // 注入 API 源，页面里的 window.XY_API_ORIGIN 用它
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

        // 用自定义 scheme 加载（不是 file://）
        if let url = URL(string: "xyapp://local/shop.html") {
            webView.load(URLRequest(url: url))
        }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .default }

    // target=_blank 在同一个 WebView 打开
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }

    // 只允许本地 app scheme 和我们的 https
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
