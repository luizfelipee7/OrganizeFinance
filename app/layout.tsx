import type { Metadata } from 'next';
import { Manrope, DM_Sans } from 'next/font/google';
import './globals.css';

const manrope = Manrope({ variable: '--font-display', subsets: ['latin'] });
const dmSans = DM_Sans({ variable: '--font-body', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://organiza-contas.luizmega432.chatgpt.site'),
  title: 'Organiza — suas contas, com clareza',
  description: 'Organize dívidas com pessoas e faturas bancárias em um só lugar.',
  openGraph: {
    title: 'Organiza',
    description: 'Suas contas, com clareza.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Organiza — suas contas, com clareza.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Organiza',
    description: 'Suas contas, com clareza.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={`${manrope.variable} ${dmSans.variable}`}>{children}</body></html>;
}
