import {Footer} from '../ui';
import {Header} from '../navigation';
export default function SiteLayout({children}) {
  return <><a className="skip" href="#main">Skip to content</a><div className="page-glow" aria-hidden="true"/><Header/>{children}<Footer/></>;
}
