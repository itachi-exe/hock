import Shell from './shell';
export const metadata = {title: 'Hock app | Simulated market', robots: {index: false, follow: false}};
export default function AppLayout({children}) {
  return <Shell>{children}</Shell>;
}
