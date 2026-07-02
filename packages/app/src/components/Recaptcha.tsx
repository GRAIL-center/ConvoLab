import React, { useCallback } from 'react';
import ReCAPTCHA from 'react-google-recaptcha';

// Wrapper component to expose onChange token to parent
export default function Recaptcha({ onChange }: { onChange: (token: string | null) => void }) {
  // Site key from Vite environment variables (prefixed with VITE_)
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

  const handleChange = useCallback(
    (value: string | null) => {
      onChange(value);
    },
    [onChange]
  );

  if (!siteKey) {
    console.warn('Recaptcha site key is not set');
    return null;
  }

  return (
    <div className="flex justify-center my-4">
      <ReCAPTCHA sitekey={siteKey} onChange={handleChange} />
    </div>
  );
}
