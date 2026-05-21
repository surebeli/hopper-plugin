import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function VendorCard({ name }: { name: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
      </CardHeader>
      <CardContent className="font-mono text-sm text-muted-foreground">adapter scaffold</CardContent>
    </Card>
  );
}
