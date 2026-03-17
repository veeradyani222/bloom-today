import React from 'react';
import { GoogleButton } from '../components/GoogleButton';
import logoUrl from '../assets/logo.png';
import heroIllustration from '../assets/welcomelittleone.svg';
import companionIllustration from '../assets/askingname.svg';
import therapistIllustration from '../assets/connectatherapist.svg';
import trustedIllustration from '../assets/connecttrustedperson.svg';
import setupIllustration from '../assets/settingthingsup.svg';
import finalIllustration from '../assets/youreallset.svg';
import './LandingPage.css';

const features = [
  {
    title: 'Personalized setup that feels easy from the start.',
    description:
      'Start by naming your companion, choosing a voice, and setting the tone you want back. Bloom Today is meant to feel personal, calm, and simple to begin.',
    image: companionIllustration,
    imageAlt: 'Illustration of a mom setting up a companion',
  },
  {
    title: 'Daily support that is there when you need to talk.',
    description:
      'For quick check-ins or longer emotional moments, you can open Bloom Today and talk naturally. The experience is made for everyday support, not just crisis moments.',
    image: setupIllustration,
    imageAlt: 'Illustration of a mom setting things up for support',
  },
  {
    title: 'Voice and video conversations feel natural and immediate.',
    description:
      'Bloom Today supports real-time voice and video so the companion feels present, responsive, and easier to connect with when words are hard to find.',
    image: finalIllustration,
    imageAlt: 'Illustration showing a calm companion setup completion',
  },
  {
    title: 'Bring your therapist in when you want support to stay aligned.',
    description:
      'With a secure connection, therapists can guide the companion experience and stay aware of what matters between sessions without taking away your sense of privacy.',
    image: therapistIllustration,
    imageAlt: 'Illustration showing therapist connection',
  },
  {
    title: 'Let a trusted person support you in a clearer way.',
    description:
      'You can also connect one trusted person so support does not stay abstract. Bloom Today helps that person understand how to show up with more clarity and care.',
    image: trustedIllustration,
    imageAlt: 'Illustration showing trusted person connection',
  },
];

export function LandingPage({ onGoogleSignIn, loading, error }) {
  if (loading) {
    return (
      <main className="landing-loading-screen">
        <div className="landing-loading-card animate-fadeInUp">
          <div className="landing-loading-spinner" />
          <p>Getting Bloom Today ready for you...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="landing-page">
      <section className="landing-shell landing-hero">
        <header className="landing-topbar">
          <a className="landing-brand" href="#top" aria-label="Bloom Today home">
            <img src={logoUrl} alt="Bloom Today" className="landing-brand__logo" />
            <span className="landing-brand__wordmark">Bloom Today</span>
          </a>
        </header>

        <div className="landing-hero__grid" id="top">
          <div className="landing-hero__visual">
            <img src={heroIllustration} alt="Illustration of a mother and baby for Bloom Today" className="landing-hero__main-art" />
          </div>

          <div className="landing-hero__copy">
            <h1>Support for new moms that feels gentle, personal, and easy to begin.</h1>
            <p className="landing-hero__lede">
              Bloom Today is a postpartum emotional support platform with a personalized AI companion you can talk to through voice and video. It is designed to give moms a private space to check in, feel understood, and stay connected to care.
            </p>

            <div className="landing-hero__actions" id="signup">
              <GoogleButton onCredential={onGoogleSignIn} disabled={loading} />
            </div>

            {error && <p className="landing-error-banner">{error}</p>}
          </div>
        </div>
      </section>

      <section className="landing-shell landing-feature-stack" id="features">
        {features.map((feature, index) => (
          <article
            key={feature.title}
            className={`landing-feature ${index % 2 === 0 ? 'landing-feature--reverse' : ''}`}
          >
            <div className="landing-feature__art">
              <img src={feature.image} alt={feature.imageAlt} />
            </div>
            <h2 className="landing-feature__heading">{feature.title}</h2>
            <p className="landing-feature__text">{feature.description}</p>
          </article>
        ))}
      </section>

      <section className="landing-shell landing-final-section">
        <div className="landing-feature__art">
          <img src={finalIllustration} alt="Illustration showing a calm setup completion" />
        </div>
        <h2 className="landing-feature__heading">Start with Bloom Today and take the next step when you are ready.</h2>
        <p className="landing-feature__text">
          Sign in with Google, create your companion, and begin with a space that is made to feel calm, supportive, and simple to return to every day.
        </p>
        <div className="landing-final-cta__actions">
          <GoogleButton onCredential={onGoogleSignIn} disabled={loading} />
        </div>
      </section>
    </main>
  );
}
