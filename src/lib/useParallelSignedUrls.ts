import { useEffect, useState } from "react";
import { supabase } from "./supabase";

interface FileWithUrl {
  name: string;
  path: string;
  url?: string;
  error?: string;
}

export function useParallelSignedUrls(
  files: FileWithUrl[],
  bucket: string = "client_vault",
  expirationSeconds: number = 3600
) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (files.length === 0) {
      setUrls({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all(
      files.map(async (file) => {
        try {
          const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(file.path, expirationSeconds);

          if (!cancelled) {
            if (error || !data?.signedUrl) {
              console.error(`Failed to create URL for ${file.name}:`, error);
            } else {
              setUrls((prev) => ({
                ...prev,
                [file.path]: data.signedUrl,
              }));
            }
          }
        } catch (err) {
          console.error(`Error creating signed URL for ${file.name}:`, err);
        }
      })
    ).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [files, bucket, expirationSeconds]);

  return { urls, loading };
}
