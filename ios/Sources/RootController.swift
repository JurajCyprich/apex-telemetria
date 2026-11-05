import CoreMotion
import UIKit
import WebKit

/// Jedna obrazovka: výber PC (adresa + stránka) a pod ňou celoobrazovkový WebView so stránkou z PC.
/// Stránka (wheel.js / common.js) volá appku cez window.webkit.messageHandlers.apex.postMessage({t: …}):
///   tap {ms}, rumble {l, s}, test, start (volant beží – zamkni obrazovku, posielaj náklon), home (späť na výber)
/// Appka posiela náklon mobilu do stránky: window.apexMotion(x, y) – smer "hore" v súradniciach mobilu.
final class RootController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate,
    UITextFieldDelegate {

    static let pages: [(title: String, path: String)] = [
        ("Volant", "/wheel"), ("Button box", "/buttonbox"), ("Displej", "/display"),
    ]
    static let defaultPort = 8777
    static let browserHttpsPort = 8778

    private var web: WKWebView!
    private let setup = UIView()
    private let field = UITextField()
    private let pagePicker = UISegmentedControl(items: RootController.pages.map { $0.title })
    private let connectButton = UIButton(type: .system)
    private let message = UILabel()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let motion = CMMotionManager()
    private let haptics = Haptics()
    private let store = UserDefaults.standard

    private var showingWeb = false
    private var motionWanted = false
    private var orientationLock: UIInterfaceOrientationMask?
    private var currentHost = ""

    private let bg = UIColor(red: 11 / 255, green: 13 / 255, blue: 18 / 255, alpha: 1)
    private let panel = UIColor(red: 20 / 255, green: 24 / 255, blue: 33 / 255, alpha: 1)
    private let orange = UIColor(red: 1, green: 159 / 255, blue: 10 / 255, alpha: 1)
    private let muted = UIColor(red: 138 / 255, green: 147 / 255, blue: 168 / 255, alpha: 1)

    // celá obrazovka: bez stavového riadku, indikátor plochy sa skryje a okraje obrazovky
    // nespustia ovládacie centrum na prvé potiahnutie (palce na pedáloch)
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { showingWeb }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { showingWeb ? .all : [] }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { orientationLock ?? .landscape }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = bg
        buildWeb()
        buildSetup()
        field.text = store.string(forKey: "host")
        pagePicker.selectedSegmentIndex = min(max(store.integer(forKey: "page"), 0), Self.pages.count - 1)
    }

    // MARK: - stavba obrazovky

    private func buildWeb() {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1"
        let ucc = WKUserContentController()
        ucc.add(self, name: "apex")
        ucc.addUserScript(WKUserScript(source: "window.APEX_APP = '\(version)';",
                                       injectionTime: .atDocumentStart, forMainFrameOnly: true))
        ucc.addUserScript(WKUserScript(source: """
            document.documentElement.classList.add('apex-app');
            var s = document.createElement('style');
            s.textContent = '*{-webkit-touch-callout:none}';
            document.head.appendChild(s);
            """, injectionTime: .atDocumentEnd, forMainFrameOnly: true))

        let config = WKWebViewConfiguration()
        config.userContentController = ucc
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        web = WKWebView(frame: .zero, configuration: config)
        web.translatesAutoresizingMaskIntoConstraints = false
        web.isOpaque = false
        web.backgroundColor = bg
        web.scrollView.backgroundColor = bg
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsLinkPreview = false
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isHidden = true
        if #available(iOS 16.4, *) { web.isInspectable = true }
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            web.topAnchor.constraint(equalTo: view.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func label(_ text: String, size: CGFloat, weight: UIFont.Weight, color: UIColor) -> UILabel {
        let l = UILabel()
        l.text = text
        l.font = .systemFont(ofSize: size, weight: weight)
        l.textColor = color
        l.numberOfLines = 0
        return l
    }

    private func buildSetup() {
        setup.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(setup)
        NSLayoutConstraint.activate([
            setup.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            setup.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            setup.topAnchor.constraint(equalTo: view.topAnchor),
            setup.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        let title = label("APEX / VOLANT", size: 26, weight: .heavy, color: .white)
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        let sub = label("Volant, button box a displej pre Apex Telemetriu na PC · verzia \(version)",
                        size: 13, weight: .regular, color: muted)

        field.placeholder = "IP adresa PC, napr. 192.168.1.20"
        field.borderStyle = .roundedRect
        field.backgroundColor = panel
        field.textColor = .white
        field.keyboardType = .numbersAndPunctuation
        field.autocorrectionType = .no
        field.autocapitalizationType = .none
        field.spellCheckingType = .no
        field.returnKeyType = .go
        field.clearButtonMode = .whileEditing
        field.font = .monospacedSystemFont(ofSize: 17, weight: .regular)
        field.delegate = self

        var bc = UIButton.Configuration.filled()
        bc.title = "Pripojiť"
        bc.baseBackgroundColor = orange
        bc.baseForegroundColor = .black
        bc.cornerStyle = .medium
        connectButton.configuration = bc
        connectButton.addTarget(self, action: #selector(connectTapped), for: .touchUpInside)
        connectButton.setContentHuggingPriority(.required, for: .horizontal)

        let row = UIStackView(arrangedSubviews: [field, connectButton])
        row.spacing = 10
        row.alignment = .fill

        pagePicker.selectedSegmentTintColor = orange
        pagePicker.setTitleTextAttributes([.foregroundColor: UIColor.black], for: .selected)
        pagePicker.setTitleTextAttributes([.foregroundColor: UIColor.white], for: .normal)

        spinner.color = .white
        spinner.hidesWhenStopped = true
        message.font = .systemFont(ofSize: 14, weight: .medium)
        message.numberOfLines = 0
        message.isHidden = true
        let status = UIStackView(arrangedSubviews: [spinner, message])
        status.spacing = 8
        status.alignment = .center

        let hint = label("""
            Najrýchlejšie: na PC otvor Apex Telemetriu → Živé dáta → Mobil a fotoaparátom iPhonu naskenuj \
            QR kód „Appka pre iPhone“ – appka sa otvorí a pripojí sama. Mobil musí byť na tej istej Wi-Fi.
            """, size: 13, weight: .regular, color: muted)

        let stack = UIStackView(arrangedSubviews: [title, sub, row, pagePicker, status, hint])
        stack.axis = .vertical
        stack.spacing = 12
        stack.setCustomSpacing(4, after: title)
        stack.setCustomSpacing(18, after: sub)
        stack.translatesAutoresizingMaskIntoConstraints = false
        setup.addSubview(stack)

        let guide = setup.safeAreaLayoutGuide
        let centerY = stack.centerYAnchor.constraint(equalTo: guide.centerYAnchor)
        centerY.priority = .defaultLow
        let width = stack.widthAnchor.constraint(equalToConstant: 520)
        width.priority = .defaultHigh
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: guide.leadingAnchor, constant: 20),
            stack.topAnchor.constraint(greaterThanOrEqualTo: guide.topAnchor, constant: 12),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: view.keyboardLayoutGuide.topAnchor, constant: -12),
            centerY, width,
        ])
    }

    private func showMessage(_ text: String?, error: Bool = false) {
        message.text = text
        message.textColor = error ? UIColor(red: 1, green: 0.42, blue: 0.38, alpha: 1) : .white
        message.isHidden = text == nil
    }

    // MARK: - pripojenie

    /// "192.168.1.20", "192.168.1.20:8777", "http://…", "https://…:8778/wheel" alebo "apextelemetria://IP:port/wheel"
    static func parse(_ text: String) -> (host: String, port: Int, page: Int?)? {
        var s = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return nil }
        if !s.contains("://") { s = "http://" + s }
        guard let c = URLComponents(string: s), let host = c.host, !host.isEmpty else { return nil }
        var port = c.port ?? defaultPort
        // odkaz na volant pre prehliadač je cez HTTPS – appka chodí na obyčajný HTTP port
        if c.scheme == "https" && (c.port == nil || c.port == browserHttpsPort) { port = defaultPort }
        let page = pages.firstIndex { !c.path.isEmpty && c.path.hasPrefix($0.path) }
        return (host, port, page)
    }

    @objc private func connectTapped() {
        view.endEditing(true)
        guard let t = Self.parse(field.text ?? "") else {
            showMessage("Zadaj IP adresu PC, napr. 192.168.1.20", error: true)
            return
        }
        connect(host: t.host, port: t.port, page: pagePicker.selectedSegmentIndex)
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        connectTapped()
        return false
    }

    func open(link url: URL) {
        loadViewIfNeeded()
        guard let t = Self.parse(url.absoluteString) else { return }
        connect(host: t.host, port: t.port, page: t.page ?? 0)
    }

    func autoConnect() {
        loadViewIfNeeded()
        guard let saved = store.string(forKey: "host"), let t = Self.parse(saved) else { return }
        connect(host: t.host, port: t.port, page: pagePicker.selectedSegmentIndex)
    }

    private func connect(host: String, port: Int, page: Int) {
        let shown = port == Self.defaultPort ? host : "\(host):\(port)"
        store.set(shown, forKey: "host")
        store.set(page, forKey: "page")
        field.text = shown
        pagePicker.selectedSegmentIndex = page
        currentHost = shown

        var c = URLComponents()
        c.scheme = "http"
        c.host = host
        c.port = port
        c.path = Self.pages[page].path
        guard let url = c.url else { return }
        showMessage("Pripájam sa na \(shown)…")
        spinner.startAnimating()
        connectButton.isEnabled = false
        web.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8))
    }

    private func showWeb(_ on: Bool) {
        showingWeb = on
        web.isHidden = !on
        setup.isHidden = on
        UIApplication.shared.isIdleTimerDisabled = on
        if !on {
            stopMotion()
            haptics.stop()
            unlockOrientation()
            if web.url?.scheme == "http" { web.loadHTMLString("", baseURL: nil) }
        }
        setNeedsUpdateOfHomeIndicatorAutoHidden()
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView.url?.scheme == "http" else { return }
        spinner.stopAnimating()
        connectButton.isEnabled = true
        showMessage(nil)
        if !showingWeb { showWeb(true) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        failed(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        failed(error)
    }

    private func failed(_ error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        spinner.stopAnimating()
        connectButton.isEnabled = true
        showWeb(false)
        showMessage("""
            PC na adrese \(currentHost) neodpovedá (\(error.localizedDescription)).
            Beží na PC Apex Telemetria? Je mobil na tej istej Wi-Fi? Pri prvom pripojení \
            povoľ appke prístup k miestnej sieti (Nastavenia → Apex Volant → Miestna sieť).
            """, error: true)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if showingWeb { webView.reload() }
    }

    // MARK: - správy zo stránky

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let d = message.body as? [String: Any], let t = d["t"] as? String else { return }
        func num(_ key: String, _ fallback: Double) -> Double { (d[key] as? NSNumber)?.doubleValue ?? fallback }
        switch t {
        case "tap": haptics.tap(ms: num("ms", 15))
        case "rumble": haptics.rumble(level: num("l", 0), sharp: num("s", 0.3))
        case "test": haptics.test()
        case "start":
            motionWanted = true
            startMotion()
            lockOrientation()
        case "home":
            showWeb(false)
            showMessage(nil)
        default: break
        }
    }

    // MARK: - náklon mobilu

    private func startMotion() {
        guard motionWanted, motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { return }
        motion.deviceMotionUpdateInterval = 1.0 / 60.0
        // gravitácia zo spojenia gyroskopu a akcelerometra – stabilná aj pri trasení rúk
        motion.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
            guard let self, self.showingWeb, let g = data?.gravity else { return }
            let js = String(format: "window.apexMotion&&apexMotion(%.5f,%.5f)", -g.x, -g.y)
            self.web.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    private func stopMotion() {
        motionWanted = false
        motion.stopDeviceMotionUpdates()
    }

    // počas jazdy sa obrazovka neotočí, ani keď mobil nakloníš veľmi prudko
    private func lockOrientation() {
        switch view.window?.windowScene?.interfaceOrientation {
        case .landscapeLeft?: orientationLock = .landscapeLeft
        case .landscapeRight?: orientationLock = .landscapeRight
        default: orientationLock = nil
        }
        setNeedsUpdateOfSupportedInterfaceOrientations()
    }

    private func unlockOrientation() {
        orientationLock = nil
        setNeedsUpdateOfSupportedInterfaceOrientations()
    }

    // MARK: - appka v pozadí / späť

    func didBecomeActive() {
        if motionWanted { startMotion() }
    }

    func willResignActive() {
        motion.stopDeviceMotionUpdates()
        haptics.suspend()
    }

    // MARK: - WKUIDelegate (alert / confirm / prompt zo stránky)

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard presentedViewController == nil else { return completionHandler() }
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard presentedViewController == nil else { return completionHandler(false) }
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Zrušiť", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        guard presentedViewController == nil else { return completionHandler(nil) }
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { $0.text = defaultText }
        a.addAction(UIAlertAction(title: "Zrušiť", style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(a.textFields?.first?.text) })
        present(a, animated: true)
    }
}
