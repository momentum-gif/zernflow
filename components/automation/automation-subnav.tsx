import Link from "next/link";
import { GitBranch, Shapes, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

/** Left sub-navigation of the Automatización area, as in ManyChat. */
export function AutomationSubnav({ active }: { active: "flows" | "basic" | "sequences" }) {
  const items = [
    { id: "flows", label: "Mis automatizaciones", href: "/dashboard/flows", icon: GitBranch },
    { id: "basic", label: "Básico", href: "/dashboard/flows/basic", icon: Shapes },
    { id: "sequences", label: "Secuencias", href: "/dashboard/sequences", icon: ListOrdered },
  ] as const;

  return (
    <nav className="w-56 shrink-0 space-y-1 border-r border-border px-3 py-6">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
            active === item.id
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
