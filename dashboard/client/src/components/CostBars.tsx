import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function CostBars() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-2 w-1/3 bg-primary" />
      </CardContent>
    </Card>
  );
}
