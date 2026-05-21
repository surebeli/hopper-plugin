import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function TaskDrawer({ id }: { id: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Task {id || 'detail'}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-sm text-muted-foreground">drawer scaffold</div>
      </CardContent>
    </Card>
  );
}
