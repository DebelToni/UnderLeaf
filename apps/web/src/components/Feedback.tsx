import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';

export function InlineError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <div className="inline-message inline-message--error" role="alert"><AlertCircle size={15}/><span>{message}</span></div>;
}

export function InlineSuccess({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <div className="inline-message inline-message--success" role="status"><CheckCircle2 size={15}/><span>{message}</span></div>;
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return <div className="loading-block" role="status"><LoaderCircle className="spin" size={17}/><span>{label}</span></div>;
}
