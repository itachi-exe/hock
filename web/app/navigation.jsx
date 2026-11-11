'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Brand,Icon} from './ui';
export function Header(){const inApp=usePathname().startsWith('/app');return <header className="site-header"><div className="container header-inner"><Brand/><nav className="site-nav" aria-label="Main navigation"><Link className="desktop-link" href="/#how-it-works">The mechanism</Link><Link className="desktop-link" href="/#build-status">Build status</Link><Link className="button" href={inApp?'/':'/app/'}>{inApp?'About Hock':'Explore preview'}<Icon/></Link></nav></div></header>}
