import { Button } from '@heroui/button';
import { Tooltip } from '@heroui/tooltip';
import { useLocalStorage } from '@uidotdev/usehooks';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { IoMdQuote } from 'react-icons/io';
import { IoCopy } from 'react-icons/io5';

import key from '@/const/key';
import { projectIdentity, PROJECT_NAME, PROJECT_MAINTAINER, PROJECT_FROZEN_MESSAGE } from '@/config/project';

/** Keep the existing widget import path, but use only local frozen-project content. */
export default function Hitokoto () {
  const [backgroundImage] = useLocalStorage<string>(key.backgroundImage, '');
  const hasBackground = !!backgroundImage;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${PROJECT_NAME} v${projectIdentity.version}\n${PROJECT_FROZEN_MESSAGE}\n维护者：${PROJECT_MAINTAINER}`);
      toast.success('复制成功');
    } catch {
      toast.error('复制失败，请手动复制');
    }
  };

  return (
    <div className='overflow-hidden'>
      <div className='relative flex flex-col items-center justify-center p-4 md:p-6'>
        <IoMdQuote className={clsx('text-4xl mb-4', hasBackground ? 'text-white/30' : 'text-primary/20')} />
        <div className={clsx('text-xl font-medium tracking-wide leading-relaxed text-center', hasBackground ? 'text-white drop-shadow-sm' : 'text-default-700 dark:text-gray-200')}>
          {PROJECT_FROZEN_MESSAGE}
        </div>
        <div className={clsx('mt-4 text-sm text-center', hasBackground ? 'text-white/90' : 'text-primary-500/80')}>
          {PROJECT_NAME} v{projectIdentity.version} · {PROJECT_MAINTAINER}
        </div>
      </div>
      <div className='flex gap-2'>
        <Tooltip content='复制项目状态' placement='top'>
          <Button
            className={clsx('transition-colors', hasBackground ? 'text-white/60 hover:text-white' : 'text-default-400 hover:text-success')}
            onPress={onCopy}
            size='sm'
            isIconOnly
            radius='full'
            variant='light'
          >
            <IoCopy />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
