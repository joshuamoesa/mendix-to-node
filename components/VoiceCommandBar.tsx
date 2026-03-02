'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { Mic, MicOff, Play } from 'lucide-react'

interface VoiceCommandBarProps {
  onCommand: (text: string) => void
  feedback?: string
  disabled?: boolean
}

// Web Speech API type augmentation
declare global {
  interface Window {
    webkitSpeechRecognition: unknown
    SpeechRecognition: unknown
  }
}

export default function VoiceCommandBar({ onCommand, feedback, disabled }: VoiceCommandBarProps) {
  const [text, setText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [hasMicSupport, setHasMicSupport] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<{ stop: () => void; start: () => void } | null>(null)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    setHasMicSupport(!!SpeechRecognition)
  }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const startListening = useCallback(() => {
    type SpeechResultItem = { transcript: string }
    type SpeechResult = { [key: number]: SpeechResultItem }
    type SpeechResultList = { [key: number]: SpeechResult; length: number }
    type SpeechRecognitionEvent = { results: SpeechResultList }
    type SpeechRecognitionInstance = {
      continuous: boolean
      interimResults: boolean
      lang: string
      onstart: (() => void) | null
      onend: (() => void) | null
      onresult: ((event: SpeechRecognitionEvent) => void) | null
      onerror: (() => void) | null
      start: () => void
      stop: () => void
    }
    const SpeechRecognitionClass = (window.SpeechRecognition || window.webkitSpeechRecognition) as new () => SpeechRecognitionInstance
    if (!SpeechRecognitionClass) return

    const recognition = new SpeechRecognitionClass()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript
      setText(transcript)
      // Auto-submit after voice input
      setTimeout(() => {
        onCommand(transcript)
        setText('')
      }, 300)
    }

    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
  }, [onCommand])

  // ⌘K / Ctrl+K — focus input
  // ⌘Shift+K / Ctrl+Shift+K — toggle mic
  // Escape — blur input
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'k') {
        e.preventDefault()
        if (isListening) {
          stopListening()
        } else {
          startListening()
        }
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isListening, startListening, stopListening])

  const handleSubmit = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onCommand(trimmed)
    setText('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-3">
      <div className="flex items-center gap-2">
        {/* Mic button */}
        {hasMicSupport && (
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={disabled}
            title={isListening ? 'Stop listening (⌘⇧K)' : 'Start voice input (⌘⇧K)'}
            className={`p-2 rounded-md transition-colors flex-shrink-0 ${
              isListening
                ? 'bg-red-100 text-red-600 hover:bg-red-200'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        )}

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={isListening ? 'Listening...' : 'Type or speak a command — "fetch projects", "export [name] to node", "launch app", "stop", "open app"'}
          className={`flex-1 text-sm border-0 outline-none bg-transparent text-slate-800 placeholder-slate-400 ${
            isListening ? 'placeholder-red-400' : ''
          }`}
        />

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || disabled}
          title="Run command"
          className="p-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Play className="w-4 h-4" />
        </button>
      </div>

      {/* Feedback strip */}
      {feedback && (
        <div className="mt-2 text-xs text-slate-500 border-t border-slate-100 pt-2">
          {feedback}
        </div>
      )}

      {/* Hint */}
      <div className="mt-1 text-xs text-slate-400">
        ⌘K to focus · ⌘⇧K to toggle mic · FluidVoice (Write Mode) types directly · Web Speech API in Chrome/Safari
      </div>
    </div>
  )
}
