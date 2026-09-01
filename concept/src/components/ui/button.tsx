import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/20 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-terracotta text-white hover:bg-terracotta-hover shadow-sm",
        secondary: "bg-white border border-line text-zinc-700 hover:bg-muted",
        ghost: "hover:bg-muted hover:text-ink",
        outline: "border border-line bg-transparent hover:bg-muted",
        ink: "bg-[#262624] text-white hover:bg-black",
        muted: "bg-muted border border-line text-zinc-700 hover:bg-white",
      },
      size: {
        default: "h-7 px-3",
        sm: "h-6 px-2.5 text-[11px]",
        lg: "h-8 px-4",
        icon: "h-7 w-7 p-0 rounded-md",
        iconSm: "h-6 w-6 p-0 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
