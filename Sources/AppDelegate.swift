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

/// 加载线上展示页。
///
/// 为什么直接走 https 而不是内嵌本地文件：
///   内嵌方案要给 WebView 自己提供 HTML/JS/CSS 的 MIME type，
///   一旦 MIME 不对（比如 text/html 变成 text/plain），页面就会白底显示一堆源码。
///   走 https 由服务器给正确的 Content-Type，行为和服务端完全一致，最稳。
///
/// 页面地址可改：改 ENTRY_URL 即可（例如换成别的域名或 /preview/shop.html）。
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    /// 入口页面
    private static let ENTRY_URL = "https://pulm-ai.work/preview/shop.html"

    private var webView: WKWebView!
    private var spinner: UIActivityIndicatorView!
    private var errorLabel: UILabel!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.949, green: 0.965, blue: 0.953, alpha: 1)

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // 页面里的后端地址（展示页默认就用这个，这里再显式注入一次）
        let js = "window.XY_API_ORIGIN='https://pulm-ai.work';window.XY_API_PROJECT='xianyu';"
        config.userContentController.addUserScript(
            WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        view.addSubview(webView)

        // 加载指示
        spinner = UIActivityIndicatorView(style: .medium)
        spinner.color = UIColor(red: 0.267, green: 0.467, blue: 0.318, alpha: 1)
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.hidesWhenStopped = true
        view.addSubview(spinner)
        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])

        // 错误提示（默认隐藏）
        errorLabel = UILabel()
        errorLabel.translatesAutoresizingMaskIntoConstraints = false
        errorLabel.textAlignment = .center
        errorLabel.numberOfLines = 0
        errorLabel.textColor = UIColor(red: 0.357, green: 0.502, blue: 0.459, alpha: 1)
        errorLabel.font = UIFont.systemFont(ofSize: 15)
        errorLabel.isHidden = true
        view.addSubview(errorLabel)
        NSLayoutConstraint.activate([
            errorLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            errorLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            errorLabel.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -48),
        ])

        load()
    }

    private func load() {
        guard let url = URL(string: WebViewController.ENTRY_URL) else { return }
        var req = URLRequest(url: url)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 20
        errorLabel.isHidden = true
        spinner.startAnimating()
        webView.load(req)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .default }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimating()
        errorLabel.isHidden = true
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        spinner.stopAnimating()
        showError(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        spinner.stopAnimating()
        showError(error)
    }

    private func showError(_ error: Error) {
        let ns = error as NSError
        // 用户主动取消（比如快速返回）不提示
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        errorLabel.text = "加载失败\n\(ns.localizedDescription)\n\n下拉可重试，或检查网络"
        errorLabel.isHidden = false
    }

    // MARK: - target=_blank 在当前 WebView 打开

    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }

    // MARK: - 白名单

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        let scheme = url.scheme?.lowercased() ?? ""

        if scheme == "about" {
            decisionHandler(.allow); return
        }
        if scheme == "https", let host = url.host, host.hasSuffix("pulm-ai.work") {
            decisionHandler(.allow); return
        }
        // 站外链接交给系统浏览器
        if scheme == "http" || scheme == "https" {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
        decisionHandler(.cancel)
    }
}
