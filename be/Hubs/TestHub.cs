using Microsoft.AspNetCore.SignalR;
namespace api.Hubs
{
    public class Connections
    {
        public string UserId { get; set; } = string.Empty;
        public string ConnectionId { get; set; } = string.Empty;
        public string RoomId { get; set; } = string.Empty;
    }
    public static class UserHandler
    {
        public static List<Connections> ConnectedIds = new();
    }
    public class TestHub : Hub
    {
        public override Task OnConnectedAsync()
        {
            return base.OnConnectedAsync();
        }
   
        public async Task JoinRoom(string roomId, string userId)
        {
            var roomCount = UserHandler.ConnectedIds.Where(x => x.RoomId == roomId).Count();
            if (roomCount == 2)
            {
                await Clients.Caller.SendAsync("full-room", userId);
                return;
            }
            UserHandler.ConnectedIds.Add(new Connections
            {
                UserId = userId,
                RoomId = roomId,
                ConnectionId = Context.ConnectionId
            });
            await Groups.AddToGroupAsync(Context.ConnectionId, roomId);
            await Clients.Group(roomId).SendAsync("user-connected", userId);
        }
        public override async Task<Task> OnDisconnectedAsync(Exception? exception)
        {
            var user = UserHandler.ConnectedIds.FirstOrDefault(x => x.ConnectionId == Context.ConnectionId);
            if (user != null)
            {
                UserHandler.ConnectedIds.Remove(user);
                await Clients.Group(user.RoomId).SendAsync("user-disconnected", user.UserId);
            }
            return base.OnDisconnectedAsync(exception);
        }
    }
}
