import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        true
    }

    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default", sessionRole: session.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private let root = RootController()

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = root
        window.makeKeyAndVisible()
        self.window = window
        // appku otvoril QR kód z PC (apextelemetria://IP:port/wheel) – pripojíme sa podľa neho
        if let url = connectionOptions.urlContexts.first?.url {
            root.open(link: url)
        } else {
            root.autoConnect()
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        if let url = URLContexts.first?.url { root.open(link: url) }
    }

    func sceneDidBecomeActive(_ scene: UIScene) { root.didBecomeActive() }
    func sceneWillResignActive(_ scene: UIScene) { root.willResignActive() }
}
