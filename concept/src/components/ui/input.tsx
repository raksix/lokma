import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-7 w-full rounded-md bg-white border border-line px-3 py-1 text-[13px] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-terracotta/20 focus:border-terracotta/30 disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = "Input"

export { Input }
