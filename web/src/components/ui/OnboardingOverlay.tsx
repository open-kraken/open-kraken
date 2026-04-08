/**
 * OnboardingOverlay — 3-step welcome guide for first-time users.
 * Shows on first login; dismissed via localStorage flag.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const STORAGE_KEY = 'open-kraken-onboarding-done';

const steps = [
  {
    title: 'Welcome to Open Kraken',
    body: 'Your multi-agent workspace where humans and AI collaborate in real-time.',
    icon: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  },
  {
    title: 'Chat & Collaborate',
    body: 'Send messages to your team, mention members with @, and share files. Terminal output flows into conversations automatically.',
    icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  },
  {
    title: 'Monitor & Control',
    body: 'Track token usage on the Dashboard, manage nodes in the topology view, and audit all actions in the Ledger.',
    icon: 'M18 20V10 M12 20V4 M6 20v-6',
  },
];

export const OnboardingOverlay = () => {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  const next = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  };

  if (!visible) return null;

  const current = steps[step];

  return createPortal(
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-card__icon-ring">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="onboarding-card__icon">
            {current.icon.split(' M').map((seg, i) => (
              <path key={i} d={i === 0 ? seg : `M${seg}`} />
            ))}
          </svg>
        </div>
        <h2 className="onboarding-card__title">{current.title}</h2>
        <p className="onboarding-card__body">{current.body}</p>

        <div className="onboarding-card__dots">
          {steps.map((_, i) => (
            <span key={i} className={`onboarding-card__dot ${i === step ? 'onboarding-card__dot--active' : ''}`} />
          ))}
        </div>

        <div className="onboarding-card__actions">
          <button type="button" className="onboarding-card__skip" onClick={dismiss}>Skip</button>
          <button type="button" className="onboarding-card__next" onClick={next}>
            {step < steps.length - 1 ? 'Next' : 'Get Started'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
