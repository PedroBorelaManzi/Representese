import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { initNativeGoogleAuthListener } from "../lib/nativeGoogleAuth";

/**
 * Mounted once near the app root. Catches the deep-link redirect back from
 * the system browser after a native Google OAuth flow (see lib/nativeGoogleAuth.ts).
 */
export default function NativeAuthListener() {
  const navigate = useNavigate();

  useEffect(() => {
    const cleanup = initNativeGoogleAuthListener({
      onSuccess: (purpose) => {
        if (purpose === "calendar") {
          toast.success("Google Agenda sincronizado com o Ecossistema Representese.");
          navigate("/dashboard/agenda");
        } else {
          toast.success("Gmail sincronizado com o Ecossistema Representese.");
          navigate("/dashboard/email");
        }
      },
      onError: (_purpose, message) => {
        toast.error(message);
      },
    });
    return cleanup;
  }, [navigate]);

  return null;
}
