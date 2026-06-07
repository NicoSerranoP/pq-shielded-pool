import Link from "next/link";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { SwitchTheme } from "~~/components/SwitchTheme";

/**
 * Site footer
 */
export const Footer = () => {
  return (
    <div className="min-h-0 px-4 pb-4">
      <div className="fixed bottom-0 left-0 z-10 flex w-full items-center justify-between gap-2 p-4 pointer-events-none">
        <Link href="/blockexplorer" passHref className="btn btn-primary btn-sm gap-1 font-normal pointer-events-auto">
          <MagnifyingGlassIcon className="h-4 w-4" />
          <span>Block Explorer</span>
        </Link>
        <SwitchTheme className="pointer-events-auto" />
      </div>
    </div>
  );
};
