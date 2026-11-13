import { Card, CardBody, CardHeader } from '@heroui/card';
import { Chip } from '@heroui/chip';
import { Divider } from '@heroui/divider';
import { Image } from '@heroui/image';
import { Link } from '@heroui/link';
import { Spinner } from '@heroui/spinner';
import { useRequest } from 'ahooks';
import { BsCodeSlash, BsCpu, BsGithub, BsGlobe, BsPlugin } from 'react-icons/bs';
import { IoDocument, IoRocketSharp } from 'react-icons/io5';

import logo from '@/assets/images/logo.svg';
import WebUIManager from '@/controllers/webui_manager';
import { projectIdentity, PROJECT_NAME, PROJECT_MAINTAINER, PROJECT_REPOSITORY, PROJECT_FROZEN_MESSAGE, PROJECT_LICENSE_NOTICE } from '@/config/project';

function VersionInfo () {
  const { data, loading, error } = useRequest(WebUIManager.GetNapCatVersion);
  return (
    <div className='flex flex-wrap items-center gap-2'>
      {error ? <Chip color='danger' variant='flat' size='sm'>{error.message}</Chip> : loading ? <Spinner size='sm' /> : <Chip size='sm' color='primary' variant='flat'>v{data?.version || projectIdentity.version}</Chip>}
      <Chip size='sm' color='default' variant='flat'>停止维护 · 不自动更新</Chip>
    </div>
  );
}

export default function AboutPage () {
  const features = [
    { icon: <IoRocketSharp size={20} />, title: '保留运行能力', desc: 'Node.js + Native 混合架构，保留归档时的核心功能。', className: 'bg-primary-50 text-primary' },
    { icon: <BsGlobe size={20} />, title: '部署方式', desc: 'Windows、Linux 及 Docker；按发行包内新手文档配置。', className: 'bg-success-50 text-success' },
    { icon: <BsCodeSlash size={20} />, title: 'OneBot 11', desc: '保留标准协议与内部兼容路径，方便连接现有应用。', className: 'bg-warning-50 text-warning' },
    { icon: <BsPlugin size={20} />, title: '自定义插件', desc: '支持本地插件；默认商店关闭，只使用用户显式配置的源。', className: 'bg-secondary-50 text-secondary' },
  ];
  const links = PROJECT_REPOSITORY ? [
    { icon: <BsGithub />, name: '项目仓库', href: PROJECT_REPOSITORY },
    { icon: <IoDocument />, name: '新手文档', href: `${PROJECT_REPOSITORY}#readme` },
    { icon: <IoDocument />, name: '许可声明', href: `${PROJECT_REPOSITORY}/blob/HEAD/LICENSE` },
  ] : [];
  const cardStyle = 'bg-default/40 backdrop-blur-lg border-none shadow-none';

  return (
    <div className='flex flex-col h-full w-full gap-6 p-2 md:p-6'>
      <title>{`关于 - ${PROJECT_NAME} WebUI`}</title>
      <div className='flex flex-col gap-2'>
        <h1 className='text-2xl font-bold flex items-center gap-3 text-default-900'>
          <Image src={logo} alt={`${PROJECT_NAME} Logo`} width={32} height={32} />
          关于 {PROJECT_NAME}
        </h1>
        <div className='flex flex-wrap items-center gap-4 text-small text-default-500'>
          <p>由 {PROJECT_MAINTAINER} 整理的固定归档项目</p>
          <Divider orientation='vertical' className='h-4' />
          <VersionInfo />
        </div>
      </div>
      <Divider className='opacity-50' />
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow'>
        <div className='lg:col-span-2 space-y-6'>
          <Card shadow='sm' className={cardStyle}>
            <CardHeader className='pb-0 pt-4 px-4'><h2 className='text-lg font-bold'>项目简介</h2></CardHeader>
            <CardBody className='py-4 text-default-600 leading-relaxed space-y-3'>
              <p>{PROJECT_NAME} 基于继承的 NapCat 代码整理，利用 NTQQ 的底层能力提供 QQ 与 OneBot 11 的运行接口。</p>
              <p>{PROJECT_FROZEN_MESSAGE}</p>
              <p>原作者贡献、技术历史与兼容标识保留在代码及第三方声明中；本项目不沿用原项目的社区群、统计或更新服务。</p>
              <p className='text-small'>{PROJECT_LICENSE_NOTICE}</p>
            </CardBody>
          </Card>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {features.map(item => (
              <Card key={item.title} shadow='sm' className={cardStyle}>
                <CardBody className='flex flex-row items-start gap-4 p-4'>
                  <div className={`p-3 rounded-lg ${item.className}`}>{item.icon}</div>
                  <div><h3 className='font-semibold text-default-900'>{item.title}</h3><p className='text-small text-default-500 mt-1'>{item.desc}</p></div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
        <div className='space-y-6'>
          <Card shadow='sm' className={cardStyle}>
            <CardHeader className='pb-0 pt-4 px-4'><h2 className='text-lg font-bold'>本项目资源</h2></CardHeader>
            <CardBody className='py-4 space-y-4'>
              {links.length ? links.map(link => (
                <Link key={link.name} isExternal href={link.href} className='flex items-center gap-3 p-3 rounded-xl hover:bg-default-100/50 text-default-600'>{link.icon}{link.name}</Link>
              )) : <p className='text-small text-default-500'>仓库地址未配置。请查阅发行包内 README.md、新手文档与 LICENSE；构建时可设置真实仓库地址。</p>}
              <p className='text-small text-default-500'>维护者：{PROJECT_MAINTAINER}</p>
            </CardBody>
          </Card>
          <Card shadow='sm' className={cardStyle}>
            <CardHeader className='pb-0 pt-4 px-4'><h2 className='text-lg font-bold flex items-center gap-2'><BsCpu /> 技术栈</h2></CardHeader>
            <CardBody className='py-4'><div className='flex flex-wrap gap-2'>{['TypeScript', 'React', 'Vite', 'Node.js', 'Electron', 'HeroUI'].map(tech => <Chip key={tech} size='sm' variant='flat'>{tech}</Chip>)}</div></CardBody>
          </Card>
        </div>
      </div>
      <div className='w-full text-center text-tiny text-default-400 py-4 mt-auto space-y-1'>
        <p>{PROJECT_NAME} · {PROJECT_MAINTAINER} · 固定归档</p>
        <p>{PROJECT_LICENSE_NOTICE}</p>
      </div>
    </div>
  );
}
