'use client';
import { Link } from './link';
import { usePathname } from 'next/navigation';

export const BackButton = () => {
  const pathname = usePathname();
  if (pathname == '/') return null;
  return <Link href="/">Back</Link>;
};
