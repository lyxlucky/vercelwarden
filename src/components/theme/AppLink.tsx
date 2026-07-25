"use client";

import { forwardRef, type AnchorHTMLAttributes } from "react";
import NextLink, { type LinkProps as NextLinkProps } from "next/link";

export type AppLinkProps = NextLinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof NextLinkProps | "href">;

export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(props, ref) {
  return <NextLink ref={ref} {...props} />;
});
