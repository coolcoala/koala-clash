import React from "react";
import { motion, AnimatePresence, Transition, HTMLMotionProps } from "framer-motion";
import { cn } from "@root/lib/utils";

export interface PowerButtonProps
  extends HTMLMotionProps<"button"> {
  checked?: boolean;
  loading?: boolean;
}

export const PowerButton = React.forwardRef<
  HTMLButtonElement,
  PowerButtonProps
>(
  (
    { className, checked = false, loading = false, disabled, onClick, ...props },
    ref
  ) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!loading && !disabled && onClick) {
        onClick(e);
      }
    };

    const sharedSpring: Transition = {
      type: "spring",
      stiffness: 100,
      damping: 30,
      mass: 1,
    };

    // Colors derived from original CSS/Theme
    const colors = {
      off: {
        bg: "var(--secondary)",
        border: "var(--border)",
        shadow: "0px 0px 6px var(--input) inset",
        iconFill: "var(--muted-foreground)",
        iconFilter: "none",
      },
      on: {
        bg: "rgb(146, 180, 184)",
        border: "rgb(255, 255, 255)",
        shadow:
          "0px 0px 2px rgb(151, 243, 255) inset, 0px 0px 4px rgb(151, 243, 255) inset, 0px 0px 20px rgb(151, 243, 255) inset, 0px 0px 80px rgb(151, 243, 255), 0px 0px 200px rgb(151, 243, 255), 0px 0px 10px rgb(151, 243, 255)",
        iconFill: "rgb(255, 255, 255)",
        iconFilter: "drop-shadow(0px 0px 10px rgb(151, 243, 255))",
      },
    };

    const glowColors = {
        on: "rgba(151, 243, 255, 0.6)",
        off: "transparent",
    };

    return (
      <div className={cn("relative flex items-center justify-center w-[200px] h-[200px]", className)}>
        {/* Outer Glow */}
         <motion.div
            className="absolute h-28 w-28 rounded-full blur-3xl pointer-events-none"
            animate={{
                backgroundColor: checked ? glowColors.on : glowColors.off,
                opacity: disabled ? 0 : checked ? 1 : 0,
                scale: checked ? 1.2 : 0.8,
            }}
            transition={sharedSpring}
        />

        {/* Inner Glow */}
        <motion.div
            className="absolute h-40 w-40 rounded-full blur-[60px] pointer-events-none"
            animate={{
                backgroundColor: checked ? "rgba(151, 243, 255, 0.2)" : "transparent",
                opacity: disabled ? 0 : checked ? 0.8 : 0,
                scale: checked ? 1.4 : 0.6,
            }}
            transition={sharedSpring}
        />

        <motion.button
          ref={ref as any}
          type="button"
          disabled={loading || disabled}
          onClick={handleClick}
          initial={false}
          animate={{
            backgroundColor: checked ? colors.on.bg : colors.off.bg,
            borderColor: checked ? colors.on.border : colors.off.border,
            boxShadow: checked ? colors.on.shadow : colors.off.shadow,
            scale: checked ? 1.05 : 1, 
          }}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: checked ? 1.1 : 1.02 }}
          transition={sharedSpring}
          className={cn(
            "relative z-10 flex items-center justify-center w-[140px] h-[140px] rounded-full border-4 cursor-pointer outline-none",
            disabled && !loading && "cursor-not-allowed opacity-50 grayscale"
          )}
          {...props}
        >
          <motion.svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            className="w-[2.4em] h-[2.4em]"
            animate={{
                filter: checked ? colors.on.iconFilter : colors.off.iconFilter
            }}
            transition={sharedSpring}
          >
            <motion.path
              d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V256c0 17.7 14.3 32 32 32s32-14.3 32-32V32zM143.5 120.6c13.6-11.3 15.4-31.5 4.1-45.1s-31.5-15.4-45.1-4.1C49.7 115.4 16 181.8 16 256c0 132.5 107.5 240 240 240s240-107.5 240-240c0-74.2-33.8-140.6-86.6-184.6c-13.6-11.3-33.8-9.4-45.1 4.1s-9.4 33.8 4.1 45.1c38.9 32.3 63.5 81 63.5 135.4c0 97.2-78.8 176-176 176s-176-78.8-176-176c0-54.4 24.7-103.1 63.5-135.4z"
              animate={{
                fill: checked ? colors.on.iconFill : colors.off.iconFill,
              }}
              transition={sharedSpring}
            />
          </motion.svg>
        </motion.button>

        <AnimatePresence>
          {loading && (
            <motion.div
              key="pb-loader"
              className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
               <div
                  className="w-[140px] h-[140px] rounded-full border-8 border-transparent animate-spin"
                  style={{
                    borderTopColor: checked ? "rgb(151, 243, 255)" : "rgb(239, 68, 68)"
                  }}
                />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

PowerButton.displayName = "PowerButton";