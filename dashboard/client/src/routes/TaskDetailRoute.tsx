import { useParams } from 'react-router-dom';
import { TaskDrawer } from '@/components/TaskDrawer';
import QueueRoute from './QueueRoute';

export default function TaskDetailRoute() {
  const { id = '' } = useParams();
  return (
    <>
      <QueueRoute />
      <TaskDrawer id={id} />
    </>
  );
}
