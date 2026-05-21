import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function QueueTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Queue</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-sm text-muted-foreground">[··· ] queue view scaffold</div>
      </CardContent>
    </Card>
  );
}
