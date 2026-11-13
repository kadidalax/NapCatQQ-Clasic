import { Card, CardBody, CardHeader } from '@heroui/card';
import { Chip } from '@heroui/chip';
import { Spinner } from '@heroui/spinner';
import { Tooltip } from '@heroui/tooltip';
import { useLocalStorage } from '@uidotdev/usehooks';
import { useRequest } from 'ahooks';
import clsx from 'clsx';
import { FaCircleInfo, FaQq } from 'react-icons/fa6';
import { IoLogoChrome, IoLogoOctocat } from 'react-icons/io5';
import { RiMacFill } from 'react-icons/ri';

import key from '@/const/key';
import WebUIManager from '@/controllers/webui_manager';
import { projectIdentity, PROJECT_NAME, PROJECT_FROZEN_MESSAGE } from '@/config/project';

export interface SystemInfoItemProps {
  title: string;
  icon?: React.ReactNode;
  value?: React.ReactNode;
  endContent?: React.ReactNode;
  hasBackground?: boolean;
}

const SystemInfoItem: React.FC<SystemInfoItemProps> = ({ title, value = '--', icon, endContent, hasBackground = false }) => (
  <div className={clsx('flex text-sm gap-3 py-2 items-baseline', hasBackground ? 'text-white/90' : 'text-default-600 dark:text-gray-300')}>
    <div className='text-lg opacity-70 self-center'>{icon}</div>
    <div className='w-24 font-medium shrink-0'>{title}</div>
    <div className={clsx('text-xs font-mono flex-1 break-all', hasBackground ? 'text-white/80' : 'text-default-500')}>{value}</div>
    <div className='self-center'>{endContent}</div>
  </div>
);

const ProjectVersion: React.FC<{ hasBackground: boolean; }> = ({ hasBackground }) => {
  const { data, loading, error } = useRequest(WebUIManager.GetNapCatVersion, {
    cacheKey: 'napcatqq-clasic-version',
    staleTime: 60 * 60 * 1000,
    cacheTime: 24 * 60 * 60 * 1000,
  });
  return (
    <SystemInfoItem
      title='项目版本'
      icon={<IoLogoOctocat className='text-xl' />}
      hasBackground={hasBackground}
      value={error ? `错误：${error.message}` : loading ? <Spinner size='sm' /> : `${PROJECT_NAME} v${data?.version || projectIdentity.version}`}
      endContent={
        <Tooltip content={PROJECT_FROZEN_MESSAGE}>
          <Chip size='sm' color='default' variant='flat'>已冻结</Chip>
        </Tooltip>
      }
    />
  );
};

export interface SystemInfoProps {
  archInfo?: string;
}

const SystemInfo: React.FC<SystemInfoProps> = ({ archInfo }) => {
  const { data: qqVersion, loading, error } = useRequest(WebUIManager.getQQVersion, {
    cacheKey: 'qq-version',
    staleTime: 60 * 60 * 1000,
    cacheTime: 24 * 60 * 60 * 1000,
  });
  const [backgroundImage] = useLocalStorage<string>(key.backgroundImage, '');
  const hasBackground = !!backgroundImage;

  return (
    <Card className={clsx('backdrop-blur-sm border border-white/40 dark:border-white/10 shadow-sm overflow-visible flex-1', hasBackground ? 'bg-white/10 dark:bg-black/10' : 'bg-white/60 dark:bg-black/40')}>
      <CardHeader className={clsx('pb-0 items-center gap-2 font-bold px-4 pt-4', hasBackground ? 'text-white drop-shadow-sm' : 'text-default-700 dark:text-white')}>
        <FaCircleInfo className='text-lg opacity-80' />
        <span>系统信息</span>
      </CardHeader>
      <CardBody className='flex-1'>
        <div className='flex flex-col gap-2 justify-between h-full'>
          <ProjectVersion hasBackground={hasBackground} />
          <SystemInfoItem title='QQ 版本' icon={<FaQq className='text-lg' />} hasBackground={hasBackground} value={error ? `错误：${error.message}` : loading ? <Spinner size='sm' /> : qqVersion} />
          <SystemInfoItem title='WebUI 版本' icon={<IoLogoChrome className='text-xl' />} hasBackground={hasBackground} value={`v${projectIdentity.version} · 冻结版`} />
          <SystemInfoItem title='系统版本' icon={<RiMacFill className='text-xl' />} hasBackground={hasBackground} value={archInfo} />
        </div>
      </CardBody>
    </Card>
  );
};

export default SystemInfo;
