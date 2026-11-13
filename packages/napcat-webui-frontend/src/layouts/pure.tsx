import { Link } from '@heroui/link';
import { Tooltip } from '@heroui/tooltip';

import { GithubIcon } from '@/components/icons';
import { PROJECT_REPOSITORY } from '@/config/project';

export default function PureLayout ({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className='relative flex flex-col h-screen'>
      {PROJECT_REPOSITORY && (
        <div className='absolute right-0 top-0 p-2'>
          <Tooltip content='查看本项目源码' placement='left' showArrow>
            <Link isExternal href={PROJECT_REPOSITORY}>
              <GithubIcon className='text-default-900 hover:text-default-600 w-10 h-10 hover:drop-shadow-lg transition-all' />
            </Link>
          </Tooltip>
        </div>
      )}
      <main className='flex-grow w-full flex flex-col justify-center items-center'>
        {children}
      </main>
    </div>
  );
}
