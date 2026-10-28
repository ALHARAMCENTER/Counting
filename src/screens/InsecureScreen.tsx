import { useI18n } from '../i18n';
import { Icon } from '../ui/Icon';

export function InsecureScreen() {
  const { t } = useI18n();
  return (
    <main class="screen center danger">
      <Icon name="warning" size={64} />
      <h1>{t('insecureTitle')}</h1>
      <p>{t('insecureBody')}</p>
    </main>
  );
}
