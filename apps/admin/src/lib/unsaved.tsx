import { useCallback, useEffect, useRef } from "react";
import { type Blocker, type BlockerFunction, useBlocker } from "react-router-dom";

import { Button, Modal } from "../components/ui";

let dirtyEditors = 0;
const bypassListeners = new Set<() => void>();

export function hasDirtyEditor(): boolean {
  return dirtyEditors > 0;
}

export function bypassAllBlockers(): void {
  for (const listener of bypassListeners) {
    listener();
  }
}

export function useUnsavedChanges(isDirty: boolean) {
  const bypassRef = useRef(false);

  useEffect(() => {
    if (!isDirty) return;
    dirtyEditors += 1;
    return () => {
      dirtyEditors = Math.max(0, dirtyEditors - 1);
    };
  }, [isDirty]);

  useEffect(() => {
    const listener = () => {
      bypassRef.current = true;
    };
    bypassListeners.add(listener);
    return () => {
      bypassListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => {
      if (!isDirty) return false;
      if (bypassRef.current) {
        bypassRef.current = false;
        return false;
      }
      return (
        currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search
      );
    },
    [isDirty],
  );

  const blocker = useBlocker(shouldBlock);

  const allowNextNavigation = useCallback(() => {
    bypassRef.current = true;
  }, []);

  return { blocker, allowNextNavigation };
}

export function ConfirmLeaveModal({ blocker }: { blocker: Blocker }) {
  return (
    <Modal
      open={blocker.state === "blocked"}
      title="Cambios sin guardar"
      onClose={() => blocker.reset?.()}
      footer={
        <>
          <Button onClick={() => blocker.reset?.()}>Seguir editando</Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>
            Descartar y salir
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        Hay cambios en este formulario que todavía no se han guardado en la Content API. Si sales
        ahora, se perderán.
      </p>
      <p className="mt-3 text-xs text-faint">
        El borrador local se guarda 600 ms después del último cambio y puedes recuperarlo al volver
        a este editor.
      </p>
    </Modal>
  );
}
