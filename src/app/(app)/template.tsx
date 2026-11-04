// A template (unlike a layout) is created fresh on every navigation, so each
// page plays its entrance animation. See .page-enter in globals.css.
export default function PageTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter space-y-5">{children}</div>;
}
