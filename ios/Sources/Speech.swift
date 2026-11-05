import AVFoundation

/// Hlas inžiniera z PC: číta systémovým hlasom iOS (slovenčina / angličtina), ide aj do slúchadiel a AirPods.
/// Hudbu alebo iný zvuk v mobile počas hlásenia len stíši.
final class Speech: NSObject, AVSpeechSynthesizerDelegate {
    private let synth = AVSpeechSynthesizer()

    override init() {
        super.init()
        synth.delegate = self
    }

    func say(_ text: String, lang: String, rate: Double, urgent: Bool) {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers])
        try? session.setActive(true)
        if urgent && synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        let u = AVSpeechUtterance(string: text)
        if lang == "en" {
            u.voice = AVSpeechSynthesisVoice(language: "en-US")
        } else {
            // slovenský hlas je v iOS štandardne; čeština ako záloha
            u.voice = AVSpeechSynthesisVoice(language: "sk-SK") ?? AVSpeechSynthesisVoice(language: "cs-CZ")
        }
        u.rate = AVSpeechUtteranceDefaultSpeechRate * Float(min(max(rate, 0.6), 1.6))
        synth.speak(u)
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        if !synthesizer.isSpeaking {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}
