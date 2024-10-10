import NextLink from 'next/link';
export const Link = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => {
  return (
    <NextLink className="hover:underline" href={href}>
      {children}
    </NextLink>
  );
};
