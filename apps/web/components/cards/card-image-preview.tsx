"use client";

import { useState } from "react";

export function CardImagePreview({
  imageUrl,
  name,
}: {
  imageUrl: string | null;
  name: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (!imageUrl) {
    return (
      <div className="mb-4 flex aspect-[2/3] max-h-[360px] items-center justify-center rounded-[22px] border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
        Sem imagem cadastrada
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="mb-4 rounded-[22px] border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-sm font-semibold text-amber-900">Imagem não encontrada</p>
        <p className="mt-2 break-all text-xs text-amber-800">{imageUrl}</p>
        <p className="mt-3 text-xs text-amber-700">
          Coloque o arquivo correspondente dentro da pasta public.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-[22px] border border-stone-200 bg-white p-3">
      <div className="flex aspect-[2/3] max-h-[360px] items-center justify-center overflow-hidden rounded-[18px] bg-stone-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={`Imagem da carta ${name}`}
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => setHasError(true)}
          src={imageUrl}
        />
      </div>
      <p className="mt-2 break-all text-xs text-stone-500">{imageUrl}</p>
    </div>
  );
}
