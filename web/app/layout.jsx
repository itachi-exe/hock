import './globals.css';
import './protocol.css';
import './console.css';
export const viewport = {width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#080b0a'};
export const metadata = {
  title: 'Hock | Borrow against your LP',
  description: 'Hock lets BTC/MUSD liquidity providers on Mezo keep earning in the gauge while borrowing MUSD against the position. This build runs on a simulated market.',
  robots: {index: false, follow: false},
};
export default function RootLayout({children}) {
  return <html lang="en"><body>{children}</body></html>;
}
