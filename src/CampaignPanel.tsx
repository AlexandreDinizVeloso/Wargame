import { FloatingWindow, type WindowProps } from './FloatingWindow';
export default function CampaignPanel(props: WindowProps) {
  const context = props.id === 'province' || props.id === 'battalion';
  return (
    <FloatingWindow
      {...props}
      height={context ? Math.min(props.height ?? 500, innerWidth < 700 ? 360 : 500) : props.height}
      className={`campaign-panel campaign-popup ${context ? 'popup-context' : ''} ${props.className ?? ''}`}
    />
  );
}
