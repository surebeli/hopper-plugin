import { useParams } from 'react-router-dom';
import { TaskDrawer } from '@/components/TaskDrawer';

export default function TaskDetailRoute() {
  const { id = '' } = useParams();
  return <TaskDrawer id={id} />;
}
