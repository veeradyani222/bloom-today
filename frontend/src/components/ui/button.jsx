import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "../../lib/utils"

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        // Simple variants based on common Shadcn UI
        variant === "default" && "bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90",
        variant === "destructive" && "bg-red-500 text-slate-50 hover:bg-red-500/90",
        variant === "outline" && "border border-zinc-200 bg-white hover:bg-zinc-100 hover:text-zinc-900",
        variant === "secondary" && "bg-zinc-100 text-zinc-900 hover:bg-zinc-100/80",
        variant === "ghost" && "hover:bg-zinc-100 hover:text-zinc-900",
        variant === "link" && "text-zinc-900 underline-offset-4 hover:underline",
        size === "default" && "h-10 px-4 py-2",
        size === "sm" && "h-9 rounded-md px-3",
        size === "lg" && "h-11 rounded-md px-8",
        size === "icon" && "h-10 w-10",
        (!variant || variant === "default") && "bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button }
