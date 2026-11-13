import { Listbox, ListboxItem } from '@heroui/listbox';
import { Chip } from '@heroui/chip';
import { BookIcon, TagIcon, UsersIcon } from '@/components/icons';
import { openUrl } from '@/utils/url';
import { projectIdentity, PROJECT_NAME, PROJECT_MAINTAINER, PROJECT_REPOSITORY, PROJECT_FROZEN_MESSAGE, PROJECT_LICENSE_NOTICE } from '@/config/project';

/** Static archive information: no GitHub statistics, release checks or contributor fetches. */
export default function NapCatRepoInfo () {
  return (
    <Listbox
      aria-label={`${PROJECT_NAME} 项目信息`}
      className='p-0 gap-0 divide-y divide-default-300/50 dark:divide-default-100/80 bg-content1 max-w-[320px] shadow-small rounded-medium bg-opacity-50 backdrop-blur-sm'
      itemClasses={{ base: 'px-3 rounded-none gap-3 py-3' }}
      disabledKeys={PROJECT_REPOSITORY ? ['status', 'version', 'maintainer'] : ['status', 'version', 'maintainer', 'repository', 'license']}
      onAction={(key) => {
        if (!PROJECT_REPOSITORY) return;
        if (key === 'repository') openUrl(PROJECT_REPOSITORY, true);
        if (key === 'license') openUrl(`${PROJECT_REPOSITORY}/blob/HEAD/LICENSE`, true);
      }}
    >
      <ListboxItem key='status' textValue='已停止维护' description={PROJECT_FROZEN_MESSAGE} endContent={<Chip size='sm' variant='flat'>已冻结</Chip>}>
        {PROJECT_NAME}
      </ListboxItem>
      <ListboxItem key='version' startContent={<TagIcon />} endContent={<span className='font-mono text-small'>v{projectIdentity.version}</span>}>归档版本</ListboxItem>
      <ListboxItem key='maintainer' startContent={<UsersIcon />} endContent={<span className='text-small'>{PROJECT_MAINTAINER}</span>}>整理者</ListboxItem>
      <ListboxItem key='repository' description={PROJECT_REPOSITORY || '仓库地址未配置；构建时设置真实仓库，不推测账号。'}>项目仓库</ListboxItem>
      <ListboxItem key='license' startContent={<BookIcon />} description={PROJECT_LICENSE_NOTICE}>许可范围</ListboxItem>
    </Listbox>
  );
}
