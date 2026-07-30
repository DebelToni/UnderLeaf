import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({
  open,
  title,
  eyebrow,
  children,
  onClose,
  size = 'medium'
}: {
  open: boolean;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  size?: 'small' | 'medium' | 'large';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const close = () => onClose();
    dialog.addEventListener('cancel', close);
    return () => dialog.removeEventListener('cancel', close);
  }, [onClose]);
  return (
    <dialog ref={ref} className={`modal modal--${size}`} onClick={(event) => event.target === ref.current && onClose()}>
      <div className="modal__surface">
        <header className="modal__header">
          <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={18}/></button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </dialog>
  );
}
