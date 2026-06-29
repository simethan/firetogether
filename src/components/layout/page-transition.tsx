"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isFirstRender, setIsFirstRender] = useState(true);
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      setIsFirstRender(false);
      prevPathname.current = pathname;
    }
  }, [pathname]);

  return (
    <div
      key={pathname}
      className={isFirstRender ? "" : "animate-slide-in"}
    >
      {children}
    </div>
  );
}
