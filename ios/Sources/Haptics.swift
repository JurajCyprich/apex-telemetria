import CoreHaptics
import Foundation

/// Vibrácie cez Taptic Engine.
/// - rumble: plynulá vibrácia, ktorej silu mení hra (obrubníky, šmyk, náraz) – ako motor v ovládači
/// - tap: krátke ťuknutie (tlačidlo, radenie)
final class Haptics {
    private let supported = CHHapticEngine.capabilitiesForHardware().supportsHaptics
    private var engine: CHHapticEngine?
    private var player: CHHapticAdvancedPatternPlayer?
    private var playing = false
    private var level: Float = 0
    private var sharp: Float = 0.3

    private func ensureEngine() -> CHHapticEngine? {
        guard supported else { return nil }
        if let engine { return engine }
        do {
            let e = try CHHapticEngine()
            e.playsHapticsOnly = true
            e.isAutoShutdownEnabled = false
            // systém engine zastaví (appka v pozadí, hovor…) – nabudúce ho vytvoríme znova
            e.stoppedHandler = { [weak self] _ in
                DispatchQueue.main.async { self?.forget() }
            }
            e.resetHandler = { [weak self] in
                DispatchQueue.main.async {
                    self?.forget()
                    self?.apply()
                }
            }
            try e.start()
            engine = e
            return e
        } catch {
            return nil
        }
    }

    private func forget() {
        engine = nil
        player = nil
        playing = false
    }

    /// level 0…1 (0 = stop), sharp 0…1 (0 = hrubé dunenie, 1 = ostré bzučanie)
    func rumble(level l: Double, sharp s: Double) {
        level = Float(max(0, min(1, l)))
        sharp = Float(max(0, min(1, s)))
        apply()
    }

    private func apply() {
        if level < 0.03 {
            if playing { try? player?.stop(atTime: CHHapticTimeImmediate) }
            playing = false
            return
        }
        guard let e = ensureEngine() else { return }
        do {
            if player == nil {
                let event = CHHapticEvent(eventType: .hapticContinuous, parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 1),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5),
                ], relativeTime: 0, duration: 10)
                let p = try e.makeAdvancedPlayer(with: CHHapticPattern(events: [event], parameters: []))
                p.loopEnabled = true
                player = p
            }
            guard let p = player else { return }
            if !playing {
                try p.start(atTime: CHHapticTimeImmediate)
                playing = true
            }
            // slabé vibrácie by Taptic Engine skoro nezahral – spodok posunieme na 25 %
            try p.sendParameters([
                CHHapticDynamicParameter(parameterID: .hapticIntensityControl, value: 0.25 + 0.75 * level, relativeTime: 0),
                CHHapticDynamicParameter(parameterID: .hapticSharpnessControl, value: sharp * 0.8 - 0.4, relativeTime: 0),
            ], atTime: CHHapticTimeImmediate)
        } catch {
            player = nil
            playing = false
        }
    }

    /// krátke ťuknutie; dlhší čas = silnejšie (stránka posiela dĺžku v ms ako pri navigator.vibrate)
    func tap(ms: Double) {
        guard let e = ensureEngine() else { return }
        let intensity: Float = ms >= 35 ? 1 : ms >= 20 ? 0.8 : 0.6
        let event = CHHapticEvent(eventType: .hapticTransient, parameters: [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.7),
        ], relativeTime: 0)
        if let p = try? e.makePlayer(with: CHHapticPattern(events: [event], parameters: [])) {
            try? p.start(atTime: CHHapticTimeImmediate)
        }
    }

    /// ukážka: ťuknutie a vibrácia, ktorá zosilnie a zastaví sa
    func test() {
        tap(ms: 40)
        let steps: [(Double, Double)] = [(0.2, 0.25), (0.5, 0.6), (0.8, 1.0), (1.3, 0)]
        for (t, l) in steps {
            DispatchQueue.main.asyncAfter(deadline: .now() + t) { [weak self] in
                self?.rumble(level: l, sharp: 0.3)
            }
        }
    }

    func stop() {
        level = 0
        apply()
    }

    /// appka ide do pozadia
    func suspend() {
        stop()
        engine?.stop(completionHandler: nil)
        forget()
    }
}
