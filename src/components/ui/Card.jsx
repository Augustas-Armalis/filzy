import { cn } from "@/lib/cn";

/*
  Card — a simple surface container plus a few optional sub-parts.
  Compose them however you like:

    <Card>
      <CardHeader>
        <CardTitle>Title</CardTitle>
        <CardDescription>Subtitle</CardDescription>
      </CardHeader>
      <CardContent>…</CardContent>
    </Card>
*/

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card text-card-foreground shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return (
    <h3 className={cn("text-lg font-semibold leading-tight", className)} {...props} />
  );
}

export function CardDescription({ className, ...props }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

export function CardContent({ className, ...props }) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}
