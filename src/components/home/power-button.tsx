import React from "react";
import {
  motion,
  HTMLMotionProps,
  Transition,
  AnimatePresence,
} from "framer-motion";
import { cn } from "@root/lib/utils";
import { Power } from "lucide-react";

export interface PowerButtonProps extends HTMLMotionProps<"button"> {
  checked?: boolean;
  loading?: boolean;
}

export const PowerButton = React.forwardRef<
  HTMLButtonElement,
  PowerButtonProps
>(({ className, checked = false, loading = false, ...props }, ref) => {
  const state = checked ? "on" : "off";

  // Единые, мягкие настройки для всех пружинных анимаций
  const sharedSpring: Transition = {
    type: "spring",
    stiffness: 100,
    damping: 30,
    mass: 1,
  };

  const glowColors = {
    on: "rgba(74, 222, 128, 0.6)",
    off: "rgba(239, 68, 68, 0.4)",
  };

  const shadows = {
    on: "0px 0px 50px rgba(34, 197, 94, 1)",
    off: "0px 0px 30px rgba(239, 68, 68, 0.6)",
    disabled: "none",
  };

  const textColors = {
    on: "rgb(255, 255, 255)",
    off: "rgb(239, 68, 68)",
    disabled: "rgb(100, 116, 139)",
  };

  const isDisabled = props.disabled && !loading;
  const currentShadow = isDisabled
    ? shadows.disabled
    : checked
      ? shadows.on
      : shadows.off;
  const currentColor = isDisabled
    ? textColors.disabled
    : checked
      ? textColors.on
      : textColors.off;

  return (
    <div className="relative flex items-center justify-center h-44 w-44">
      <motion.div
        className="absolute h-28 w-28 rounded-full blur-3xl"
        animate={{
          backgroundColor: state === "on" ? glowColors.on : glowColors.off,
          opacity: isDisabled ? 0 : checked ? 1 : 0.3,
          scale: checked ? 1.2 : 0.8,
        }}
        transition={sharedSpring}
      />

      <motion.div
        className="absolute h-40 w-40 rounded-full blur-[60px]"
        animate={{
          backgroundColor: checked
            ? "rgba(34, 197, 94, 0.2)"
            : "rgba(239, 68, 68, 0.1)",
          opacity: isDisabled ? 0 : checked ? 0.8 : 0,
          scale: checked ? 1.4 : 0.6,
        }}
        transition={sharedSpring}
      />

      <motion.button
        ref={ref}
        type="button"
        disabled={loading || props.disabled}
        animate={{
          scale: checked ? 1.1 : 0.9,
          boxShadow: currentShadow,
          color: currentColor,
        }}
        whileHover={{ scale: checked ? 1.15 : 0.95 }}
        whileTap={{ scale: checked ? 1.05 : 0.85 }}
        transition={sharedSpring}
        className={cn(
          "group",
          "relative z-10 flex items-center justify-center h-36 w-36 rounded-full border-2",
          "backdrop-blur-sm bg-white/10 border-white/20",
          "focus:outline-none",
          "disabled:cursor-not-allowed",
          isDisabled &&
            "grayscale opacity-50 bg-slate-100/70 border-slate-300/80",
          className,
        )}
        {...props}
      >
        <motion.span
          className="flex items-center justify-center"
          animate={{ scale: checked ? 1 / 1.1 : 1 }}
          whileTap={{ scale: 0.95 }}
          transition={sharedSpring}
        >
          <Power className="h-20 w-20" />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {loading && (
          <motion.div
            key="pb-loader"
            className="absolute inset-0 z-20 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div
              className={cn(
                "h-full w-full animate-spin rounded-full border-4",
                "border-transparent",
                checked ? "border-t-green-500" : "border-t-red-500",
                "blur-xs",
              )}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
