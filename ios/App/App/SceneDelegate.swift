import UIKit

// Adoção do ciclo de vida baseado em Scene (UIScene) — sem isso, builds
// recentes do iOS/iPadOS crasham o app no LANÇAMENTO com EXC_BREAKPOINT em
// UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption (rejeição da
// Apple em 2026-09-29, build 1.78/179, crash só reproduzido no review deles
// — não víamos localmente porque o simulador/dispositivos de teste ainda
// não tinham essa SDK). A janela e o controller raiz continuam vindo do
// mesmo Main.storyboard de sempre (UISceneStoryboardFile no Info.plist) —
// só o "dono" da janela mudou de UIApplication pra UIWindowScene.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let _ = (scene as? UIWindowScene) else { return }
        // UIKit já cria a UIWindow e instancia o rootViewController a
        // partir do UISceneStoryboardFile (Main) sozinho quando a scene
        // conecta — nada a fazer aqui além de existir pra satisfazer o
        // UIApplicationSceneManifest.
    }

    func sceneDidDisconnect(_ scene: UIScene) {
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
    }

    func sceneWillResignActive(_ scene: UIScene) {
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
    }
}
