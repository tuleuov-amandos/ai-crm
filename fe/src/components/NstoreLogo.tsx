import React from "react";
import Image from "next/image";
import logoImg from "@/app/favicon.ico";

export function NstoreLogo() {
  return (
    <div className="flex items-center gap-2">
      <Image
        src={logoImg}
        alt="NSTORE"
        width={28}
        height={28}
        unoptimized
        className="rounded-lg shrink-0"
      />
      <span
        className="tracking-[-0.025em] text-foreground"
        style={{ fontSize: 17, fontWeight: 700 }}
      >
        NSTORE
      </span>
    </div>
  );
}
