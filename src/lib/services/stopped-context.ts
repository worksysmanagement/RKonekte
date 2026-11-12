import { StoppedNoticePayload } from "@/lib/auth/session";
import { getOrganizationById } from "@/lib/services/organizations";
import { getOrganizationSubscriptionOverview } from "@/lib/services/subscriptions";
import {
  computeSubscriptionState,
  isSubscriptionAccessBlocked,
} from "@/lib/utils/subscription";

export async function buildStoppedClientContext(notice: StoppedNoticePayload) {
  const org = await getOrganizationById(notice.organizationId);
  if (!org || org.status !== "ACTIVE") {
    return {
      resumed: false,
      accountInactive: true,
      serviceStopped: false,
      isAdmin: notice.isAdmin,
      organizationName: org?.name || notice.organizationName,
    };
  }

  const subState = computeSubscriptionState(org);
  if (!isSubscriptionAccessBlocked(org)) {
    return {
      resumed: true,
      serviceStopped: false,
      isAdmin: notice.isAdmin,
      organizationName: org.name,
    };
  }

  if (!notice.isAdmin) {
    return {
      resumed: false,
      serviceStopped: true,
      isAdmin: false,
      organizationName: org.name,
      message:
        subState.isExpired && !org.serviceStopped
          ? "L'abonnement de votre entreprise a expiré. Veuillez contacter votre administrateur pour la réactivation."
          : "Veuillez contacter votre administrateur pour cet arrêt de service.",
    };
  }

  const overview = await getOrganizationSubscriptionOverview(org.id);
  return {
    resumed: false,
    serviceStopped: true,
    isAdmin: true,
    organizationName: overview.organization.name,
    userEmail: notice.userEmail,
    userName: notice.userName,
    state: overview.state,
    autoMessageTitle: overview.settings.autoMessageTitle,
    autoMessageBody: overview.settings.autoMessageBody,
    plans: overview.plans,
    paymentAccounts: overview.paymentAccounts,
    pendingRenewal: overview.pendingRenewal,
    lastRejectedRenewal: overview.lastRejectedRenewal,
  };
}
